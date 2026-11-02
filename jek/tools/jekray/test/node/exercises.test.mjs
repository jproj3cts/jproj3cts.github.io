// The exercises (core/exercises.js): each starts from a reel's bench that is there, names parts that are on it and
// measures the optimiser has, gives two hints and a result line; the reels' challenges are the "Can you…" ones; a
// visit's address starts the right one. The reels' challenges (CHALLENGES) are kept apart from the course. That each can be solved, and only so, is the browser suite's ('Exercises').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHALLENGES, EXERCISES, checkPasses, checkWant, exerciseArrival, exerciseBench, exerciseById, exerciseOfReel, isChallenge } from '../../src/core/exercises.js';
import { REELS } from '../../src/ui/reels.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const METRICS = new Set([...readFileSync(join(here, '../../src/ui/optimise.js'), 'utf8').matchAll(/\{ key: '([a-zA-Z0-9]+)', fam: '[a-z]+', on: '([a-z]+)'/g)].map(m => m[1] + '@' + m[2]));
const kindOf = e => (e.type === 'fibre' ? 'fibre' : e.type);

test('every exercise and challenge starts from a reel’s bench, and names parts on it and measures they have', () => {
  const ids = new Set();
  for (const ex of [...EXERCISES, ...CHALLENGES]) {
    assert.match(ex.id, /^[a-z0-9][a-z0-9-]{0,47}$/, ex.id);
    assert.ok(!ids.has(ex.id), 'one id each: ' + ex.id); ids.add(ex.id);
    const reel = REELS.find(r => r.id === ex.start.reel);
    assert.ok(reel && reel.bench, ex.id + ': its reel’s bench');
    const b = exerciseBench(ex, reel.bench), on = n => b.elements.find(e => e.name === n);
    assert.equal(new Set(b.elements.map(e => e.id)).size, b.elements.length, ex.id + ': ids apart');
    for (const c of ex.checks) {
      assert.ok(on(c.part), ex.id + ': ' + c.part + ' is on the bench');
      if (c.field) assert.ok(isFinite(on(c.part)[c.field]), ex.id + ': ' + c.part + '.' + c.field + ' is a number');
      else assert.ok(METRICS.has(c.key + '@' + kindOf(on(c.part))), ex.id + ': ' + c.key + ' is measured on a ' + on(c.part).type);
      assert.ok(['above', 'below', 'within'].includes(c.op) && isFinite(c.value) && (c.op !== 'within' || c.tol > 0));
    }
    for (const [n, f] of Object.entries(ex.unlocked)) { assert.ok(on(n), ex.id + ': ' + n); for (const k of f) assert.ok(k in on(n) || k === 'aperture', ex.id + ': ' + n + '.' + k); }
    for (const [n, R] of Object.entries(ex.optimiser || {})) for (const [k, [lo, hi]] of Object.entries(R)) assert.ok((ex.unlocked[n] || []).includes(k) && lo < hi, ex.id + ': the optimiser’s ' + n + '.' + k);
    for (const [n, f] of Object.entries(ex.answer)) for (const k of Object.keys(f)) assert.ok((ex.unlocked[n] || []).includes(k), ex.id + ': the answer changes only what may be');
    assert.equal(ex.hints.length, 2);
    assert.ok(ex.goal && ex.title && (ex.teaches || isChallenge(ex)));
    assert.equal(typeof ex.result(ex.checks.map(c => c.value)), 'string');
    // the reel's own bench is left as it was
    assert.ok(!reel.bench.elements.some(e => e.id === 'exs1'));
  }
  assert.equal(EXERCISES.length, 11);
});

test('the reels’ challenges are apart from the course: each its own "Can you…" reel’s, newest first, found by id and by reel', () => {
  assert.ok(CHALLENGES.length >= 1);
  const order = REELS.map(r => r.id);
  for (const c of CHALLENGES) {
    const reel = REELS.find(r => r.id === c.reel);
    assert.ok(reel, c.id + ': its reel is in REELS');
    assert.equal(c.start.reel, c.reel, c.id + ': starts from its own reel’s bench');
    assert.equal(c.title, reel.title, c.id + ': titled as the reel');
    assert.ok(!EXERCISES.some(x => x.id === c.id || x.reel === c.reel), c.id + ': not also in the course');
    assert.equal(exerciseById(c.id), c); assert.equal(exerciseOfReel(c.reel), c); assert.ok(isChallenge(c));
  }
  const at = CHALLENGES.map(c => order.indexOf(c.reel));
  assert.deepEqual(at, [...at].sort((a, b) => a - b), 'newest first, as REELS');
  assert.ok(!EXERCISES.some(isChallenge));
  assert.deepEqual(exerciseArrival('?src=ig-hit-the-pinhole'), { id: 'hit-the-pinhole', from: 'reel' });
  assert.deepEqual(exerciseArrival('?ex=hit-the-pinhole&src=solved'), { id: 'hit-the-pinhole', from: 'link' });
});

test('the reels’ challenges are their "Can you…" reels, and an address starts the right exercise', () => {
  for (const r of REELS) { const ex = exerciseOfReel(r.id); if (ex) assert.match(r.title, /^Can you/, r.id); }
  assert.deepEqual(EXERCISES.filter(x => x.reel).map(x => x.reel).sort(), ['ig-both-sharp', 'ig-double-beam', 'ig-get-it-back-in', 'ig-thread-both-irises']);
  assert.deepEqual(exerciseArrival('?ex=close-the-gap'), { id: 'close-the-gap', from: 'link' });
  assert.deepEqual(exerciseArrival('?src=ig-thread-both-irises'), { id: 'thread-both-irises', from: 'reel' });
  assert.deepEqual(exerciseArrival('?ex=close-the-gap&src=solved'), { id: 'close-the-gap', from: 'link' });
  assert.equal(exerciseArrival('?src=ig-zoom-lens'), null);
  assert.equal(exerciseArrival('?ex=nothing'), null);
  assert.equal(exerciseArrival(''), null);
});

test('a check passes above, below or within its tolerance, and not without a reading', () => {
  const A = { op: 'above', value: 0.9 }, B = { op: 'below', value: 0.03 }, W = { op: 'within', value: 4, tol: 0.2 };
  assert.ok(checkPasses(A, 0.95) && !checkPasses(A, 0.9) && !checkPasses(A, null));
  assert.ok(checkPasses(B, 0.02) && !checkPasses(B, 0.03));
  assert.ok(checkPasses(W, 3.81) && checkPasses(W, 4.2) && !checkPasses(W, 4.21) && !checkPasses(W, NaN));
  assert.deepEqual([A, B, W].map(checkWant), ['above 0.9', 'below 0.03', '4 ± 0.2']);
});
