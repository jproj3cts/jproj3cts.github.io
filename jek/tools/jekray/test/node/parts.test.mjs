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
const { PARTS, PART_ORDER, TYPE_LABEL, FREE_PARTS, FREE_GROUPS, PART_BY_KEY, PALETTE_PARTS, PALETTE_GROUPS, pickerRows } = await import('../../src/parts/registry.js');
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
test('the keys map: lens presets are lenses, the fibre palette is fibre components, the chopper is a part of its own', () => {
  for (const k of ['lens', 'asphere', 'diffractive', 'grinrod', 'cylinder', 'axicon']) assert.equal(PART_BY_KEY[k], PARTS.lens);
  for (const k of ['laser', 'coupler', 'splitter', 'combiner', 'led', 'bpd', 'soa', 'pd', 'thru']) assert.equal(PART_BY_KEY[k], PARTS.fcomp);
  assert.equal(makeElement('chopper', 0, 0).type, 'chopper'); assert.equal(PART_BY_KEY.chopper, PARTS.chopper);
  assert.equal(makeElement('elec:chopper', 0, 0).type, 'chopper');          // (the key it had: still made, for a Recent list kept from before)
  assert.equal(makeElement('splitter', 0, 0).kind, 'split'); assert.equal(makeElement('combiner', 0, 0).combine, true);
  assert.equal(makeElement('rf:horn', 0, 0).type, 'source'); assert.ok(makeElement('rf:horn', 0, 0).mmw);
});
test('the palette and rail tables come from the parts and cover each other', () => {
  const picked = new Set(PALETTES.free.map(r => r[0])), grouped = new Set(FREE_GROUPS.flatMap(([, ks]) => ks));
  assert.deepEqual([...picked].sort(), [...grouped].sort());
  assert.deepEqual(PART_GROUPS.free, FREE_GROUPS);
  assert.deepEqual(PALETTES.rf.map(r => r[0]).sort(), RF.groups.flatMap(([, ks]) => ks).sort());
  for (const k of picked) assert.ok(PART_BY_KEY[k], k + ' has a part');
});
test('every palette is built the same way: its rows the parts’ own picker entries, each row in one of its groups, each group’s keys rows', () => {
  for (const pal of Object.keys(PALETTE_PARTS)) {
    const rows = PALETTES[pal], keys = rows.map(r => r[0]), grouped = PALETTE_GROUPS[pal].flatMap(([, ks]) => ks);
    assert.ok(rows.length > 0, pal + ' has parts');
    assert.deepEqual(rows, pickerRows(PALETTE_PARTS[pal]), pal + ': the parts’ entries');
    assert.deepEqual(PART_GROUPS[pal], PALETTE_GROUPS[pal]);
    assert.equal(new Set(keys).size, keys.length, pal + ': no key twice');
    assert.deepEqual([...keys].sort(), [...grouped].sort(), pal + ': every part in a group (none left to Other), every grouped key a part');
    for (const k of keys) assert.ok(makeElement(k, 0, 0), pal + ' ' + k + ' makes a part');
  }
  // the counts as they stand, and the photonic parts an experimental feature
  assert.deepEqual(Object.fromEntries(Object.keys(PALETTE_PARTS).map(p => [p, PALETTES[p].length])), { free: 34, fibre: 32, elec: 19, rf: 12, pic: 8 });
  assert.ok(PALETTES.pic.every(r => r[3] === 'pic') && PALETTES.elec.every(r => !r[3]));
  // one Lamp entry (the flat one is its Shines setting; its old key still makes one), the modulators a group of their
  // own, and the fibre tip and collimator with the link plane
  const freeKeys = PALETTES.free.map(r => r[0]), groupOf = k => PALETTE_GROUPS.free.find(([, ks]) => ks.includes(k))[0];
  assert.ok(freeKeys.includes('lamp') && !freeKeys.includes('lamp2d'));
  assert.equal(makeElement('lamp2d', 0, 0).lampFlat, true);
  assert.deepEqual(['aom', 'eom', 'chopper'].map(groupOf), ['Modulators', 'Modulators', 'Modulators']);
  assert.deepEqual(['link', 'fibre', 'collimator'].map(groupOf), ['Tabs', 'Tabs', 'Tabs']);
  assert.ok(PALETTE_GROUPS.elec.some(([, ks]) => ks.includes('elec:thru')), 'the electrical feedthrough is in a group');
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
test('every part in every palette has the plain words it is searched by (what it is for)', async () => {
  const { PART_USES, partWords } = await import('../../src/ui/part-uses.js');
  await import('../../src/engines/elec.js'); await import('../../src/engines/pic.js');
  const keys = Object.keys(PALETTES).flatMap(pal => PALETTES[pal].map(r => r[0]));
  assert.ok(keys.length > 100, keys.length + ' parts');
  for (const k of keys) assert.ok(PART_USES[k] && PART_USES[k].split(' ').length >= 3, k + ' has its uses');
  for (const k of Object.keys(PART_USES)) assert.ok(keys.includes(k), k + ' is a part');
  const find = q => keys.filter(k => q.split(' ').every(w => partWords({ key: k, short: '', long: '' }).includes(w)));
  assert.ok(find('focus').includes('lens')); assert.ok(find('measure power').includes('detector'));
  assert.ok(find('split').includes('cube')); assert.ok(find('frequency doubling').includes('nlc'));
});
