/* Comparing and merging benches: the pure module, on hand-built benches. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffProject, merge3, resolve } from '../../src/io/merge.js';

const el = (id, type, extra = {}) => ({ id, type, name: type, x: 0, y: 0, angle: 0, bench: 'b1', ...extra });
const bench = (elements, extra = {}) => ({ format: 'jekray', version: 3, name: 'B', benches: [{ id: 'b1', name: 'Bench 1' }], tab: 'b1', elements, fibres: [], notes: '', snap: 1, ...extra });
const P = JSON.parse, S = JSON.stringify;
const clone = v => P(S(v));

test('compare: added, removed and changed items, and settings', () => {
  const a = bench([el('l', 'laser'), el('m', 'mirror', { x: 50 }), el('s', 'screen')]);
  const b = bench([el('l', 'laser'), el('m', 'mirror', { x: 60, angle: 45 }), el('n', 'lens')], { snap: 5, notes: 'hi' });
  const d = diffProject(a, b);
  assert.equal(d.count, 5);
  assert.deepEqual(d.items.map(i => [i.change, i.id]), [['changed', 'm'], ['removed', 's'], ['added', 'n']]);
  assert.deepEqual(d.items[0].fields.map(f => [f.key, f.from, f.to]), [['x', 50, 60], ['angle', 0, 45]]);
  assert.deepEqual(d.settings.map(s => s.key), ['snap', 'notes']);
  assert.equal(diffProject(a, clone(a)).count, 0);
});

test('merge: each side’s own changes go in, the same change once, and target’s order is kept', () => {
  const base = bench([el('l', 'laser'), el('m', 'mirror', { x: 50 }), el('s', 'screen')]);
  const target = bench([el('l', 'laser', { power: 2 }), el('m', 'mirror', { x: 50 }), el('s', 'screen'), el('t', 'lens')]);
  const source = bench([el('m', 'mirror', { x: 50, angle: 30 }), el('l', 'laser'), el('u', 'iris')], { notes: 'from the fork' });
  const m = merge3(base, target, source);
  assert.deepEqual(m.conflicts, []);
  assert.deepEqual(m.result.elements.map(e => e.id), ['l', 'm', 't', 'u']);       // s removed by source, u added
  assert.equal(m.result.elements[0].power, 2);
  assert.equal(m.result.elements[1].angle, 30);
  assert.equal(m.result.notes, 'from the fork');
  assert.equal(m.result.name, 'B');
  assert.deepEqual(m.taken, { target: 2, source: 4, both: 0 });   // source: m turned, s removed, u added, the notes
  // the same change on both: once, no conflict
  const both = merge3(base, bench([el('l', 'laser', { power: 3 })]), bench([el('l', 'laser', { power: 3 })]));
  assert.deepEqual(both.conflicts, []);
  assert.equal(both.result.elements[0].power, 3);
});

test('merge: conflicts on a field, on remove-versus-change, on a setting, and their resolution', () => {
  const base = bench([el('l', 'laser'), el('m', 'mirror', { x: 50 }), el('s', 'screen')], { snap: 1 });
  const target = bench([el('l', 'laser'), el('m', 'mirror', { x: 60 })], { snap: 2 });        // moved m, removed s, snap 2
  const source = bench([el('l', 'laser'), el('m', 'mirror', { x: 70 }), el('s', 'screen', { x: 9 })], { snap: 5 }); // moved m elsewhere, changed s, snap 5
  const m = merge3(base, target, source);
  assert.deepEqual(m.conflicts.map(c => [c.kind, c.id, c.key]), [['elements', 'm', 'x'], ['elements', 's', null], ['settings', 'snap', 'snap']]);
  // unresolved: target's side stands
  let r = resolve(m);
  assert.equal(r.elements.find(e => e.id === 'm').x, 60);
  assert.equal(r.elements.some(e => e.id === 's'), false);
  assert.equal(r.snap, 2);
  // the fork's side on each
  m.conflicts.forEach(c => { c.choice = 'source'; });
  r = resolve(m);
  assert.equal(r.elements.find(e => e.id === 'm').x, 70);
  assert.equal(r.elements.find(e => e.id === 's').x, 9);
  assert.equal(r.snap, 5);
  // the merge does not change its inputs
  assert.equal(target.elements.length, 2);
});

test('merge: fibres and tabs are keyed lists too; a field removed on one side goes', () => {
  const base = bench([el('a', 'fibre-tip'), el('b', 'fibre-tip')], { fibres: [{ id: 'f', a: ['a', 0], b: ['b', 0], len: 1, loss: 0.2, disp: 17 }] });
  const target = clone(base); target.fibres[0].len = 5;
  const source = clone(base); delete source.fibres[0].disp; source.benches.push({ id: 'b2', name: 'Bench 2' });
  const m = merge3(base, target, source);
  assert.deepEqual(m.conflicts, []);
  assert.equal(m.result.fibres[0].len, 5);
  assert.equal('disp' in m.result.fibres[0], false);
  assert.deepEqual(m.result.benches.map(b => b.id), ['b1', 'b2']);
});
